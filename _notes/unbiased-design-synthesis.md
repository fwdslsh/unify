# Unbiased design synthesis: the composition model unify should ship

**Date:** 2026-08-11
**Author:** independent design review (no stake in either prior document)
**Method:** read both spec bodies in full (`main`'s app-spec/dom-spec/include-syntax/getting-started/cli-reference; this branch's product-spec/authoring-rules); read all five `_notes/` analyses as evidence, not authority; independently re-ran the shipped v0.6.6 tool on minimal sites to verify every load-bearing implementation claim before relying on it.

**Independently verified against the shipped tool (not taken from the audit):**
- Automatic `_layout.html` discovery does not run. A page with no `data-unify` ships raw, exit 0, "Build completed successfully!".
- With explicit `data-unify`, a page whose body is bare content (`<h1>` + `<p>`, no landmarks, no area classes) has that content **silently dropped**; the layout's placeholder ships. Exit 0.
- The same page with content wrapped in `<main>` composes correctly — the shipped tool's landmark path (page `<main>` → layout `<main>`) is its **only** working intuitive path.
- `<title>`: page replaces layout (site name lost). `<link rel="icon">` is deleted during composition. Markdown pages get no layout, a doubled `<title>`, and an unrequested `og:title`.
- `<include src>` (paired) and SSI comment includes both inline correctly.
- Slots (`<template data-slot>`) appear in main's app-spec §Authoring Quick Rules and exist nowhere in the code.

---

## 1. Verdict

**Neither document should ship as written. The branch's product-spec is the better product** — its engine rules (transactional publish, the content-loss law, mirror copy, URL provenance, the reference check, the advisory cap) are the strongest material in the repository and should be adopted nearly wholesale. **But its composition vocabulary makes one strategic error that a third design corrects: it invented `unify-*` classes and `data-unify` — zero-training-density vocabulary that must be learned from documentation — while explicitly refusing `<slot>`, the one standard whose framework semantics (Astro, Vue, WebC, web components) are an exact match for what unify needs, and which every current model and most working front-end developers already know cold.**

The recommended model keeps the branch's file rules, error contract, and CLI, and replaces its area mechanism with two standards: **`<main>` as the implicit default slot** (the HTML spec itself defines `<main>` as "content unique to this document," excluding repeated chrome — the default-slot rule is the HTML spec's own page/chrome division, not a tool convention), and **`<slot name>` / `slot=` as the explicit named-region mechanism** (replace-the-element semantics, fallback children, direct-children scoping — all borrowed intact from the platform). This deletes the branch spec's three worst remaining rules — the pinned-areas rule (whose depth semantics its own §7 concedes are unsettled), the attribute-discard rule on area overrides, and the `unify-` namespace — and replaces them with behavior that previews correctly in a browser with no polyfill, validates as standard HTML (`slot` is a global attribute; `<slot>` is a standard element), and matches the priors of both audiences.

Main's DOM Cascade is not the better product — component mode, ordered fill, contract blocks, the attribute-merge matrix, the linter codes, and the seven-flag glob pipeline all fail the "explainable in one sentence / no silent surprise" bar, and the shipped implementation of it drops content and deletes head elements on a green build. But main's *instinct* — lean on semantic HTML and standard vocabulary, "conventions first, avoid special syntax" — was right, and the branch discarded the instinct along with the broken mechanisms. The correct synthesis is the branch's discipline with main's standards instinct executed properly.

---

## 2. Idea inventory

Every distinct composition/authoring idea found across both spec bodies, the implementation, and the notes. **Adopt** = enters the recommended model; **Adapt** = enters in changed form; **Cut** = rejected (reasons in §6).

### Composition mechanisms

| # | Idea | Source | Judgment |
|---|---|---|---|
| 1 | Layout via attribute on `<html>`/`<body>` (`data-unify="/path"`) | both | **Adapt** — keep the mechanism, respell as `data-layout` (self-describing; zero brand vocabulary) |
| 2 | Component mode (`data-unify` on any element) | main (spec + code) | **Cut** — a component framework in disguise; shipped version emits empty divs silently |
| 3 | `unify-*` area classes (replace-children, layout keeps tag/attrs) | both | **Cut** — replaced by standard slots; invented vocabulary with zero density |
| 4 | Landmark fallback (`header/nav/main/aside/footer` by sectioning root) | main (spec + working code) | **Adapt** — narrowed to `<main>` only, where it is exact; other landmarks cut |
| 5 | Ordered fill (`main > section` by index) | main | **Cut** — index-based magic, maximal surprise |
| 6 | `<template data-slot>` slots | main app-spec:110 (never implemented) | **Adapt** — the right instinct in a nonstandard spelling; realized as standard `<slot name>`/`slot=` |
| 7 | Default slot = layout's `<main>`, children replaced | branch (and the one working path in shipped code) | **Adopt** — the zero-vocabulary golden path |
| 8 | Pinned areas inside `<main>` + pinning depth rule | branch | **Cut** — the explicit `<slot>` inside `<main>` expresses every pinning case with no rule at all |
| 9 | Page's top-level `<main>` unwrapped once | branch (panel S2) | **Adopt** verbatim |
| 10 | Layout opt-out (`data-unify="none"` / `layout: none`) | branch | **Adopt** (as `data-layout="none"`) |
| 11 | Layout chaining, pairwise compose | both | **Adopt** |
| 12 | Attribute-merge matrix on matched elements + ID stability + ARIA reference rewriting | main | **Cut** — slots make it unnecessary; replace-element means the author's markup ships as written |
| 13 | Root attribute merge on `<html>`/`<body>` only (class union, page wins) | branch | **Adopt** |
| 14 | `<include src>` element, paired form, `/`-from-root vs relative | branch | **Adopt** |
| 15 | SSI `<!--#include virtual/file -->` alias | both | **Adopt** — highest-density include syntax in existence; also the W3C-valid spelling |
| 16 | Synthetic `unify-content` wrapper for unaddressed content | implementation only | **Cut** — fails closed by deleting content; the worst behavior verified in this review |
| 17 | Short-name layout resolution (`blog` → `_blog.layout.html`) | main (spec + code) | **Cut** — path guessing; `layout: default` must fail loudly, not resolve to something plausible |
| 18 | Nearest `_layout.html` directory discovery | both (dead code on main) | **Adopt** — the single most valuable convention in the product (Next.js `layout.tsx` made it a mass convention) |
| 19 | `_includes/layout.html` site-wide fallback | main | **Cut** (panel S7#3: only memorized filename in the model; the upward walk already covers it) |
| 20 | `<style data-unify-docs>` contract blocks, build-stripped | main | **Cut** — silent deletion of an author element; plain HTML comments in the scaffold instead |
| 21 | Head merge: title page-wins (replace) | main + shipped | **Cut** — loses the site name on every page |
| 22 | Head merge: page title prepends, layout carries separator | branch (panel S1) | **Adopt** |
| 23 | Meta dedup by `name`/`property`; canonical/icon dedup by `rel`; script/style dedup by URL/hash | main | **Adopt** — fixes the double-canonical bug the branch created (salvage §B) |
| 24 | Stylesheet/script URL dedup compared after resolution | branch | **Adopt** |
| 25 | Charset: layout wins, stays first; differing charsets advisory | branch | **Adopt** |
| 26 | Frontmatter minimal keys (`title/layout/class/lang/dir` + any-key→meta, `og:` blocks) | branch | **Adopt** |
| 27 | Frontmatter `head:` structured schema (meta/link/script/style lists) | main | **Cut** — a config language inside YAML; state the honest gap instead |
| 28 | HTML frontmatter = error; `<head>` in Markdown body = error | main | **Adopt** — the two highest-frequency cross-generator reflexes, both silently wrong otherwise |
| 29 | Markdown `<h1>` → title fallback | implementation only | **Adopt** — the one genuinely good idea that exists only in code |
| 30 | Markdown heading `id` slugs | branch | **Adopt** |
| 31 | `data-layer` CSS layering hints | main | **Cut** — speculative, no behavior |
| 32 | Design-time = build-time parity (browser preview produces identical DOM) | main principle, branch polyfill | **Adopt** — and the slot model shrinks the polyfill: fallback children already render in browsers with no script |

### File, CLI, and error-model ideas

| # | Idea | Source | Judgment |
|---|---|---|---|
| 33 | `_*` exclusion as `--exclude` default; guard problem if replaced carelessly | branch (panel S4) | **Adopt** |
| 34 | `_dir/` exception worked example (files inside `_` dirs need no own prefix) | main app-spec:830 | **Adopt** into docs |
| 35 | Never-shipped list (`.git`, `node_modules`, `.env*`, output dir, config) | branch | **Adopt** |
| 36 | `.gitignore` respected by build | main (Eleventy parity) | **Cut** — output must not depend on VCS state; the never-shipped list + `_*` covers the hazard |
| 37 | Seven-flag glob pipeline (`--copy/--ignore/--ignore-render/--ignore-copy/--render/--auto-ignore/--default-layout`) | main | **Cut** — one `--exclude` replaces all seven |
| 38 | Asset reference tracking (copy only what's referenced) | main + code | **Cut** — mirror copy matches "what you see in the folder ships" |
| 39 | Mirror copy of all non-page files | branch | **Adopt** |
| 40 | URL provenance rewriting (`href/src/srcset/poster` resolved per authoring file, emitted root-relative) | branch | **Adopt** |
| 41 | Pretty URLs with link rewriting; preserved-link list | main's table + branch's rule | **Adopt** — main's seven-row transformation table becomes conformance fixtures |
| 42 | `--base-url` subpath + absolute-URL og/canonical | branch | **Adopt** |
| 43 | Post-build reference check, publish-blocking | branch | **Adopt** — the strongest agent affordance in either document |
| 44 | Transactional build (all-or-nothing publish) | branch | **Adopt** |
| 45 | Content-loss law ("content the author wrote is never dropped without failing the build") | branch | **Adopt verbatim — the best sentence in either document; it assigns every unenumerated case** |
| 46 | Two severities only (problem/advisory), advisory cap, observed-not-instructed phrasing | branch (panel S3/S4) | **Adopt** |
| 47 | U001–U008 rule codes, severities, YAML config, `unify fix` | main | **Cut** — governance machinery; useful checks survive as advisories |
| 48 | Security scanner + `[SECURITY]` gates + `--fail-on security` | main | **Cut** — scanning the author's own HTML is theater; path-traversal safety stays internal |
| 49 | Watch contract (coalesced full rebuilds, atomic writes, skip-unchanged, precise deletes) | branch | **Adopt** |
| 50 | Incremental builds, build cache, dependency graphs | main + code | **Cut** for MVP — full rebuild guarantees watch ≡ fresh build |
| 51 | Error pages in the browser while watching | branch | **Adopt** |
| 52 | `unify dev` (build+watch+serve+reload, hard-scoped) | branch | **Adopt** |
| 53 | `--dry-run` naming each page's composition inputs | branch | **Adopt** — layout resolution is the one fact not readable from a single file |
| 54 | Exit codes 0/1/2 (success / build error / usage) | main cli-reference | **Adopt** |
| 55 | Error template: what / `in: file:line` / short fix list, incl. "check spelling and casing" | main include-syntax | **Adopt** |
| 56 | Cycle errors print the chain | main include-syntax | **Adopt** |
| 57 | `unify.yaml` = saved flags only | branch | **Adopt** |
| 58 | Plugin hooks (pre/post build, import resolvers) | main | **Cut** — the filesystem seam is the extension story |
| 59 | Filesystem-as-plugin-interface, `_scripts/` generators, blog template ships generator | branch/notes | **Adopt** |
| 60 | Contract-as-semver, versioning discipline for selectors | main | **Cut** — governance for a problem the audience doesn't have |
| 61 | Scoped styles = author's own `@scope`/`@layer` (documented non-feature) | main app-spec:1736 | **Adopt** into docs |
| 62 | `init` templates exercising each primitive once; `AGENTS.md` deferred | panel N2/N3 | **Adopt** |
| 63 | One-screen `authoring-rules.md` with byte-identity test to README | branch | **Adopt** — rewritten for the slot model |

---

## 3. The recommended composition model

Working name: **standards-first composition**. The authoring surface remains four primitives; one is respelled:

| You want to… | You write… |
|---|---|
| Reuse a fragment (nav, footer, badge) | `<include src="/_includes/nav.html"></include>` |
| Wrap pages in a layout | nothing — the nearest `_layout.html` applies; `data-layout="/path.html"` to pick one, `data-layout="none"` to opt out |
| Mark where page content lands / let pages replace a named region | `<main>` for the default; `<slot name="footer">…</slot>` in the layout, `slot="footer"` on a page element |
| Keep a file or folder out of the built site | a leading underscore: `_draft.html`, `_includes/` |

The precedence rule, in one sentence — the sentence the branch model needed a pinning clause, an ambiguity concession, and a conformance-spec deferral to approximate:

> **Page content goes to the layout's `<slot>` elements — named fills to named slots, everything else to the bare slot; if the layout has no bare slot, everything else replaces the children of its `<main>`.**

### 3.1 Includes

Unchanged from the branch spec (§3.1), which is correct: `<include src="…"></include>` inlined textually before parsing; `/` resolves from the source root, anything else relative to the including file; nested includes cycle-safe and depth-capped, violations are problems that print the chain; Markdown fragments converted before inlining; SSI `<!--#include virtual/file -->` supported indefinitely as the migration alias — and documented as the W3C-valid spelling for authors who care about validation, since `<include>` is the one non-standard token left in the model. The shipped `ssi-processor.js` path resolution is the reference implementation (the audit is right that it is the only correct one in the codebase); the `html-processor.js` fileSystem-map guessing and the infinite loop on a missing include are discarded with their host.

### 3.2 Layout selection

First match wins:

1. `data-layout="none"` on the page's `<html>` or `<body>`, or frontmatter `layout: none` → emitted as-is (includes and URL rules still apply).
2. `data-layout="/path.html"` on `<html>` or `<body>` → explicit choice.
3. Frontmatter `layout: /path.html` → the Markdown equivalent.
4. The nearest `_layout.html`, from the page's directory up to the source root.
5. Nothing found → emitted as-is.

A layout may itself carry `data-layout` to chain into a parent; chains compose pairwise and are depth-capped. A bare name (`layout: default`) is an error naming the fix — layouts are paths. `data-layout` means nothing on any element other than `<html>`/`<body>`; anywhere else it is a problem naming `<include>` as the replacement. During migration, `data-unify` and `unify-*` classes are problems naming their new spelling — the shipped tool's users (if any exist; nothing composes correctly today) get a one-edit diagnosis, never silent behavior drift.

*Why `data-layout` and not `data-unify`:* the attribute names the concept, not the brand. An agent or a designer who has never seen unify reads `data-layout="/base.html"` and knows what it does; `data-unify` requires product knowledge that has zero presence in training data or human memory. There is no installed base to protect — verified: the shipped tool cannot execute its own golden path.

### 3.3 The merge — four rules

**Rule 1 — Slots.** A layout's `<body>` may contain `<slot>` elements. A page element carrying `slot="name"` fills `<slot name="name">`: **the slot element is replaced by the filling element(s)** — the page's markup ships exactly as written, no attribute merging, no discarding. Multiple fills with the same name land in page order. A slot nothing fills is replaced by its own children (its fallback — which is also what a browser shows when the layout is opened directly). `slot=` is honored on the page's top-level elements (children of `<body>`, after Rule 2's unwrap) — the same direct-children scoping the platform uses, which is also what keeps unify's hands off `slot=` attributes inside an author's own web-component markup. Slots inside `<template>` elements are never touched (that is an author's declarative shadow DOM, not unify's). Slots are recognized only in layouts, and only in `<body>`; a `<slot>` in a page is an advisory, a second bare `<slot>` in a layout is an advisory and the first wins.

The layout author controls the replacement boundary by where they put the slot, with no additional rule:

```html
<!-- Replace the whole element: page's element ships, tag and all -->
<slot name="hero"><section class="hero">Default hero</section></slot>

<!-- Replace only the children: the styled wrapper persists -->
<footer class="site-footer"><slot name="footer"><p>© My Site</p></slot></footer>
```

This one placement choice covers everything the branch needed both its area rule (replace children, keep host) *and* an escape from it for; and everything main needed its attribute-merge matrix for.

**Rule 2 — Main, the zero-vocabulary default.** If the layout has no bare `<slot>` but has a `<main>`, the page's remaining content (everything not addressed to a named slot) replaces the children of `<main>`. Before the merge, incoming body content is unwrapped once: if it contains a `<main>`, that element is replaced by its children — so a page written as a complete semantic document, and a chained layout's own `<main>`, both compose without nesting. No other element is unwrapped. If the layout has named slots but neither a bare `<slot>` nor a `<main>`, unaddressed page content would vanish: that is a problem, located, naming the fix. A layout with no slots and no `<main>` contributes its head and passes the page's body through unchanged — the head-only layout is legitimate.

Note what no longer exists: the pinned-areas rule, pinning depth, and the `<main class="unify-content">` precedence question (branch §7 item 2, panel S6) are all gone, because a layout that wants persistent content inside `<main>` alongside page content writes it explicitly:

```html
<main>
  <slot name="hero"><section class="hero">Default hero</section></slot>
  <slot></slot>
</main>
```

Every pinning case is now visible in the layout's own markup, previews correctly in a browser, and needs zero spec text.

**Rule 3 — Head merge.** Start with the layout's head. The page's `<title>` is prepended to the layout's, joined with a space — the separator lives in the layout (`<title>— My Site</title>` + `<title>Home</title>` → `Home — My Site`); a page with no title keeps the layout's alone. A page `<meta>` replaces a layout `<meta>` with the same `name`/`property`; a page `<link rel="canonical">` or `<link rel="icon">` replaces the layout's same-`rel` element (adopting main's per-rel key — this closes the double-canonical bug the branch spec created); every other page head element is appended after the layout's, so page CSS wins the cascade; exact-duplicate stylesheet/script URLs deduplicate, compared after URL resolution. Charset: the layout's wins and stays first; a page declaring a different one is an advisory.

**Rule 4 — Root attributes.** On `<html>` and `<body>` only: the page's classes are added to the layout's; any other attribute the page sets wins. Attributes merge nowhere else — Rule 1's replace-element semantics make elementwise attribute rules unnecessary. `<body class="home">` + `body.home .nav-home {…}` remains the active-nav answer.

**The law that closes the taxonomy** (adopted verbatim from the branch): *content the author wrote is never dropped without failing the build.* A fill addressed to a slot the layout doesn't have is an advisory and the content flows to the default slot — nothing lost, and the misplacement is visible in one second. A page top-level `<header>`/`<footer>` outside any slot is an advisory (probably meant `slot=`). Everything that would omit content is a problem and blocks publish.

### 3.4 The five-minute site under this model

`_layout.html` — a complete page; open it in a browser and you see exactly the defaults (slot fallbacks render natively; the starter stylesheet carries `slot { display: contents }` so wrappers add no box):

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
    <footer class="site-footer">
      <slot name="footer"><p>© My Site</p></slot>
    </footer>
  </body>
</html>
```

`index.html` — a complete ordinary document; it names nothing:

```html
<!doctype html>
<html>
  <head><title>Home</title></head>
  <body>
    <main>
      <h1>Welcome!</h1>
      <p>This lands in the layout's main.</p>
    </main>
  </body>
</html>
```

`contact.html` — overrides the footer:

```html
<!doctype html>
<html>
  <head><title>Contact</title></head>
  <body>
    <h1>Contact</h1>
    <p>Ordinary content as usual.</p>
    <p slot="footer">© My Site — <a href="mailto:hi@example.com">email us</a></p>
  </body>
</html>
```

Built `contact.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Contact — My Site</title>
    <link rel="stylesheet" href="/assets/style.css">
  </head>
  <body>
    <nav>…shared nav…</nav>
    <main>
      <h1>Contact</h1>
      <p>Ordinary content as usual.</p>
    </main>
    <footer class="site-footer">
      <p>© My Site — <a href="mailto:hi@example.com">email us</a></p>
    </footer>
  </body>
</html>
```

Observations that are the point: the first layout an author writes can use **zero** unify vocabulary beyond `<include>` (a bare `<main>` is enough); the page that overrides a region uses one **standard global attribute**; the built footer contains exactly the element the author wrote; and no output contains any tool vocabulary at all.

### 3.5 Everything else

Adopt the branch spec's §3.4 (Markdown, plus the `<h1>` title fallback from the shipped code and the loud errors for HTML-frontmatter and Markdown-`<head>` from main), §3.5 (URL provenance), and §4 in full — CLI surface (with `data-unify` → `data-layout` respelled and exit codes 0/1/2 adopted), `--exclude` with the `_*` default and its guard, the never-shipped list, output safety, transactional build, the watch contract, `unify dev`, advisories with the cap and phrasing discipline, `--dry-run` composition reporting, the reference check, the filesystem seam, and the non-goals of §5 — with one wording change: the templating non-goal drops "`<slot>`" from its refusal list (it now refuses "template languages: no `{{ }}`, no `{% %}`, no expressions, no props") and the component non-goal stays (slots fill layouts; includes stay verbatim; **`<include>` never takes fills** — that line is what keeps slots from becoming a component framework).

---

## 4. Training-density analysis — the strategic question, answered firmly

**Conclusion: the branch spec made a real strategic error, and main's spec made the complementary one.** The branch refused `<slot>`/`<template>` and landmark matching — the standards — while inventing `unify-*` and keeping `data-unify`, vocabulary with zero external existence. Main embraced standards in the wrong place (implicit landmark/ordered-fill *magic*, which surprises) while also inventing vocabulary (`data-unify`, `data-unify-docs`, `u-item-*`). Both spent the product's novelty budget backwards: **invented words for things standards already name, and implicit magic where explicitness was needed.**

The density ledger, honestly weighed:

- **`<main>` as the default slot: maximum density, zero cost.** The HTML spec defines `<main>` as content "unique to that document," explicitly excluding repeated site chrome. That is *verbatim* the page/layout division this tool exists to automate. Every tutorial since 2011 teaches it; agents emit `<main>`-wrapped content unprompted at very high rates (and when they don't, the merge takes bare body content anyway). This rule costs nothing to learn because both audiences already follow it for their own reasons — it is the single best example of "conventions a designer already follows" in either document, and it is also the only path in the shipped tool that ever worked.

- **`slot` vocabulary: high density with the right semantics — because of frameworks, not shadow DOM.** The branch's refusal rationale ("Shadow DOM semantics do not apply here") attacks the weakest referent. The dominant `slot` in 2020s training data is the *framework* slot — Astro's `<slot />` and `<slot name="…">` in layout files (an SSG layout idiom, precisely this product's domain), Vue's named slots, Svelte, Eleventy WebC — none of which involve shadow DOM, style isolation, or a runtime. Their shared semantics: a named hole with fallback content, filled by content marked with the slot's name, replaced element-for-element. That is exactly the needed behavior, transferred intact. The two genuine shadow-DOM residues are handled by *adopting* the platform's own rules rather than fighting them: fills count only on direct children (which simultaneously protects an author's real web-component markup from unify), and `<template>` interiors are never touched (which protects declarative shadow DOM). Even the preview story improves: a slot's fallback children render in any browser with no script — the layout previews its own defaults natively, which `unify-*` classes cannot claim and which the branch's polyfill exists to simulate.

- **`unify-*` / `data-unify`: zero density, recurring cost.** Every use must be learned from unify's own docs, forever, by every human and every agent, and the branch's own panel measured the consequence: five of its sixty rule-file lines are *negative* rules existing only to fence tool-invented vocabulary. §3.3's three justifications for the prefix all survive the switch: intent stays visible (a `<slot>` is more self-announcing than a class — it is a hole by name), collisions are handled by the platform's scoping rules, and the tooling selector (`slot[name]`) is simpler than `[class*="unify-"]`.

- **The rest of the surface is already density-aligned and stays:** YAML frontmatter with `title:`/`layout:` (Jekyll/GitHub Pages, enormous), nearest-`layout` file per directory (`Next.js layout.tsx` made this a mass convention; `_layout.html` adds the Jekyll underscore), `_includes/` (Jekyll), SSI comments (the include syntax with actual decades of prior art), and standard `<head>` merging that authors never write — they just write normal heads.

- **Where standards lose and the branch was right:** full landmark matching. A page's `<header>` is usually the *article's* header; auto-replacing site chrome with it is high-surprise, and the sectioning-root machinery main used to tame it cannot be explained in a sentence. Density is necessary but not sufficient — the standard must also mean, in its home context, what unify makes it do. `<main>` and `slot` pass that test; bare `<header>`-matching and ordered fill do not. The firm rule for all future vocabulary decisions: **borrow a standard when its native semantics are the semantics you need; invent only when no standard means the thing; never do implicit magic in either vocabulary.**

The remaining invented tokens in the recommended model are two, both self-describing English rather than brand names: `<include src>` (the concept has no standard HTML spelling; SSI is the valid-HTML alias) and `data-layout` (the standard extension attribute carrying the universal word for the concept). An agent that has read nothing can parse the entire model; an agent that has read sixty lines can author it. That was the branch's own goal — this is the vocabulary that achieves it.

---

## 5. What each document got right that the other missed

**The branch spec got right (and main lacks entirely):**
1. The audience definition and the non-goals wall — refusing templating, config, collections, and components is the product's identity, and §5 is the best-argued section in the repository.
2. The error contract: two severities, the content-loss law, transactional publish, the reference check, exit-0-means-published. Main's shipped counterpart prints warnings to stderr and exits 0 while deleting content — the branch's contract is the difference between a tool and a hazard.
3. Deploy safety as a design layer: mirror copy, `_*`/`--exclude` with the guard, the never-shipped list, `--clean` refusal, collision detection.
4. URL provenance rewriting — the one computation a single-file author cannot do, done for them.
5. Honesty discipline: the polyfill as a complexity budget, the one-screen rules file with a byte-identity test, advisories capped and phrased as observations.

**Main's spec got right (and the branch cut or missed):**
1. The standards instinct — "use semantic HTML + class names; avoid special syntax" (dom-spec Goals). Main gestured at landmarks and even at slots (`<template data-slot>`, app-spec:110); the branch, reacting to main's broken execution, walled off the instinct itself.
2. Per-`rel` head dedup for canonical and icon — without it the branch emits doubled canonicals (salvage §B confirmed).
3. The operational details worth stealing wholesale: exit codes 0/1/2; the error-message template with suggestion lists and "check the path spelling and casing"; cycle errors printing the chain; the `_dir/` exception worked example; the pretty-URL preserved-link table; HTML-frontmatter and Markdown-`<head>` as hard errors.
4. Design-time/build-time parity as a stated principle ("Same behavior… identical DOM") — the branch rediscovered it as the polyfill; main said it first and plainly.
5. `.gitignore` awareness names a real hazard class (secrets in the tree) even though its mechanism is wrong; the branch's never-shipped list is the correct answer to main's correct worry.

---

## 6. Rejected ideas, with reasons

- **Component mode** (`data-unify` on any element). It is a props-less component framework: an import site plus an override contract plus attribute merge rules. Fails one-sentence explainability; fails loudly-caught (the shipped version emits an empty `<div>` silently); and its use case (parameterized fragments) is a declared non-goal whose sanctioned answer is the generator seam. Includes stay verbatim; slots belong to layouts only.
- **Ordered fill.** Mapping `main > section` by index is position-based coupling: inserting one section in a layout reflows every page's content silently. Maximal surprise, zero density as a concept, nothing catches it.
- **Full landmark matching** (`header/nav/aside/footer`). See §4 — a page's header is usually content, not chrome; auto-replacement is wrong more often than right, and the sectioning-root qualifier that would fix it cannot be taught in a sentence. Survives only as the advisory on stray top-level `<header>`/`<footer>`.
- **`unify-*` area classes with replace-children.** Zero density (§4); carries two silent traps the slot model deletes (page attributes discarded on overrides; override marker doubles as a shipped CSS class); and its hardest semantics — keeping some of `<main>`'s children — needed the pinning rule, whose depth question the branch itself left unsettled. Slots express the same boundary by markup position with no rule.
- **`<template data-slot>`** (main's spelling). Right concept, wrong token: `data-slot` has no external density while `slot=`/`<slot name>` is the standard it imitates; and `<template>` as a *fill* container hides page content from browser preview (template contents don't render), violating source-preview honesty.
- **`<style data-unify-docs>` contract blocks + U001/U004/U005.** A documentation *container* enforced by a linter is governance machinery; the build silently deleting a `<style>` element is the worst failure class in either spec. Slots self-document (a hole with a name and visible fallback); the scaffold shows a plain-comment convention.
- **The attribute-merge matrix, ID stability, ARIA reference rewriting.** An impressive answer to a question replace-element semantics never asks. If the page's element ships, references the page wrote keep working because nothing rewrote them.
- **Short-name layout resolution.** `layout: blog` resolving through a strip-and-search of `_blog.layout.html` across three directory tiers is path guessing; the Jekyll reflex `layout: default` must fail with a one-line fix, not resolve plausibly.
- **Seven-flag glob pipeline, `--auto-ignore`, `.gitignore` respect, asset reference tracking.** Four interacting classification tiers where one `--exclude` plus mirror copy suffices; builds must not change because VCS metadata changed; "the folder is the site" beats reachability analysis for this audience.
- **Security scanner + `--fail-on security`.** Scanning the author's own static HTML for XSS in their own content gates nothing real; traversal safety stays internal and invisible.
- **Incremental builds/cache for MVP.** Buys speed this audience doesn't need at the cost of the strongest watch guarantee available: watch output ≡ fresh build, always.
- **Frontmatter `head:` schema.** YAML that compiles to arbitrary head elements is a config language with worse ergonomics than the HTML it generates. The honest residue (a Markdown page cannot express canonical/JSON-LD) is documented: put it in the layout, or write that page in HTML.
- **`_includes/layout.html` fallback.** The only memorized filename in the model, and it inverts the underscore convention; the `_layout.html` walk already reaches the root.
- **Making `<include>` take slot fills** (a tempting synthesis nobody proposed). Explicitly refused here: it recreates component mode inside the include primitive. Includes are verbatim, forever; the moment an include has an override contract, unify has a component framework.
- **Hyphenated `<html-include>` for validator cleanliness.** Real prior art exists (custom-element include libraries), but trading the cleanest possible token for a validator green-check inverts the audience's priorities; SSI is already the valid spelling for those who need one.

---

## 7. Migration reality

Baseline honesty first: **the distance from main's shipped code to *either* spec is nearly identical, because the composition core must be rewritten regardless.** Verified in this review: auto-discovery dead, bare content dropped, titles replaced, favicons deleted, Markdown un-layouted, a missing include hangs the build. There is no conservative option that keeps the current engine; the choice is which small model to rebuild toward. Choosing slots over `unify-*` changes *which ~300 lines* the new merge core is, not how much work realignment is.

**Survives (roughly as-is or harvested):**
- `ssi-processor.js` — becomes the include engine (correct `file`/`virtual` resolution, located warnings).
- `head-merger.js` — dedup keys and `_normalizeAssetPath` harvested; title logic replaced by the prepend rule.
- `markdown-processor.js` — trimmed to §3.4 keys; keeps `gray-matter`/`markdown-it` and the `<h1>` fallback; gains heading ids.
- `file-watcher.js`, the static server + SSE transport inside `serve` — harvested into `unify dev`/`watch` under the new contract.
- `link-normalizer.js`, `html-minifier.js` — harvested for pretty-URL rewriting and post-MVP `--minify`.
- `path-validator.js` — stays as invisible internal safety (drop the `[SECURITY]` theater around it).
- `init`, binary builds, `dry-run-reporter.js` (rewired), config loading (reduced to the flags mirror).

**Deleted outright:** `html-processor.js` (2,047 lines — component mode, the synthetic `unify-content`, the include-guessing resolver, the hang), all five `cascade/` modules (area/landmark/ordered-fill/attribute mergers; landmark logic is superseded by the one-paragraph main-rule), `dom-cascade-linter.js`, `security-scanner.js`, `glob-pattern-processor.js`, `incremental-builder.js`, `build-cache.js`, `dependency-tracker.js`, `asset-tracker.js`, `short-name-resolver.js`, `default-layout-resolver.js`, `layout-resolver.js` (already dead — 412 of 465 lines commented out, zero importers). That is ~8,000 of ~13,300 source lines.

**Newly written:** the slot filler (collect `slot=` fills from top-level page content; replace `<slot name>`; fallback on unfilled; bare-slot/`<main>` default; the unwrap; ~250–350 lines), layout discovery walk (~50), URL provenance rewriter, reference checker, collision detection, transactional publisher, the advisory/problem reporter. Identical to the branch's own §7 Fix list except the filler replaces the area matcher — and rule 2's conformance fixtures get *simpler*, because pinning cases became explicit markup instead of edge semantics.

**Tests:** of the 240 test files, everything asserting component mode, linter codes, glob tiers, cache, scanner, short names, and `unify-content` dies with its module — well over half. Survivors: SSI/include tests, parts of head-merger and markdown tests, path-validator, watcher scaffolding. The real test investment shifts to the conformance pairs (each §3 rule as input→output fixtures) and the golden-path E2E — exactly the suite the branch spec already planned; the slot model changes fixture *contents*, not the plan.

**Documentation:** `product-spec.md` is amended in place (§3.2/§3.3 respelled to slots and `data-layout`; §5's refusal list drops `<slot>`; everything else stands). `authoring-rules.md` is rewritten to the same length — early drafting suggests it gets *shorter*, because the negative rules fencing `unify-*`/`data-unify` and the pinning caveats disappear. `dom-spec.md`/`app-spec.md` retire behind the existing banners into the conformance-spec rewrite; `CLAUDE.md` follows the spec as it already does on this branch.

**Net:** the four-primitive product the branch defined, the engine contract the branch specified, the standards vocabulary main gestured at — and two fewer invented words than either document shipped with.
